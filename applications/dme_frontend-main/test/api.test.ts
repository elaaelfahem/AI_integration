import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApi } from '@/lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthApi', () => {
  it('parses successful JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ whitelist: '@orange.com' }), {
          status: 200,
        }),
      ),
    );

    await expect(new AuthApi().getEmailWhitelist()).resolves.toEqual(
      '@orange.com',
    );
  });

  it('normalizes backend validation errors into ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: ['Invalid request'] }), {
          status: 400,
        }),
      ),
    );

    await expect(new AuthApi().getEmailWhitelist()).rejects.toMatchObject({
      message: 'Invalid request',
      status: 400,
    });
  });

  it('maps unavailable APIs to a stable network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(new AuthApi().getEmailWhitelist()).rejects.toMatchObject({
      message:
        'The backend could not be reached. Check that the API server is running.',
      status: 0,
    });
  });

  it('retries transient GET failures without retrying mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-token' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ whitelist: '*' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = new AuthApi();
    await api.login({ email: 'admin@example.com', password: 'password' });

    await expect(api.getEmailWhitelist()).resolves.toEqual('*');
    await expect(
      api.createDataSource({
        name: 'RNE',
        type: 'OFFICIAL_REGISTRY',
        collectionMethod: 'API',
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('deduplicates concurrent refresh requests', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const api = new AuthApi();
    const first = api.restore();
    const second = api.restore();
    resolveResponse?.(
      new Response(JSON.stringify({ accessToken: 'token' }), { status: 200 }),
    );

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps data-source lifecycle calls to their protected API endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-token' }), {
          status: 200,
        }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'resource-id' }), {
            status: 200,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const api = new AuthApi();
    await api.login({ email: 'admin@example.com', password: 'password' });

    await api.createDataSource({
      name: 'RNE',
      type: 'OFFICIAL_REGISTRY',
      collectionMethod: 'API',
      configurationReference: 'Public lookup',
    });
    await api.setDataSourceEnabled('source-id', true);
    await api.setDataSourceEnabled('source-id', false);
    await api.retireDataSource('source-id');
    await api.listCollectionJobs();
    await api.getCollectionJob('job-id');
    await api.startCollectionJob({
      sourceIds: ['source-id'],
      sector: 'Fintech',
    });

    const requests = fetchMock.mock.calls.slice(1).map(([url, init]) => ({
      url,
      method: init.method,
      body: init.body,
    }));
    expect(requests).toEqual([
      expect.objectContaining({
        url: 'http://localhost:3001/data-sources',
        method: 'POST',
        body: JSON.stringify({
          name: 'RNE',
          type: 'OFFICIAL_REGISTRY',
          collectionMethod: 'API',
          configurationReference: 'Public lookup',
        }),
      }),
      expect.objectContaining({
        url: 'http://localhost:3001/data-sources/source-id/enable',
        method: 'POST',
      }),
      expect.objectContaining({
        url: 'http://localhost:3001/data-sources/source-id/disable',
        method: 'POST',
      }),
      expect.objectContaining({
        url: 'http://localhost:3001/data-sources/source-id',
        method: 'DELETE',
      }),
      expect.objectContaining({
        url: 'http://localhost:3001/data-sources/jobs/history',
        method: 'GET',
      }),
      expect.objectContaining({
        url: 'http://localhost:3001/data-sources/jobs/job-id',
        method: 'GET',
      }),
      expect.objectContaining({
        url: 'http://localhost:3001/data-sources/jobs',
        method: 'POST',
        body: JSON.stringify({ sourceIds: ['source-id'], sector: 'Fintech' }),
      }),
    ]);
  });

  it('maps company response fields to the backend DTO contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-token' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'company-id' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const api = new AuthApi();
    await api.login({ email: 'admin@example.com', password: 'password' });

    await api.createCompany({
      name: 'Example',
      contact_name: 'Contact',
      client_category: 'GOLD',
      mobile_lines: 42,
      manager_id: 'manager-id',
    });

    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Example',
          contactName: 'Contact',
          clientCategory: 'GOLD',
          mobileLines: 42,
          managerId: 'manager-id',
        }),
      }),
    );
  });

  it('maps the prospection report lifecycle and PDF export endpoints', async () => {
    const pdf = new Response('%PDF-1.4', { status: 200 });
    pdf.headers.set('Content-Disposition', 'attachment; filename="report.pdf"');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-token' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'VISITED' }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'report-id' }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'report-id' }), { status: 200 }),
      )
      .mockResolvedValueOnce(pdf);
    vi.stubGlobal('fetch', fetchMock);
    const api = new AuthApi();
    await api.login({ email: 'manager@example.com', password: 'password' });

    await api.updateProspection('assignment-id', { status: 'VISITED' });
    await api.submitProspectionReport('assignment-id', {
      summary: 'Visit summary',
      needs: 'Connectivity',
      outcome: 'Follow-up',
    });
    await api.getProspectionReport('assignment-id');
    const exportResult = await api.exportProspectionReport('assignment-id');

    expect(exportResult.filename).toBe('report.pdf');
    expect(
      fetchMock.mock.calls.slice(1).map(([url, init]) => [url, init.method]),
    ).toEqual([
      ['http://localhost:3001/prospections/assignment-id/update', 'POST'],
      ['http://localhost:3001/reports/assignment-id', 'POST'],
      ['http://localhost:3001/reports/assignment-id', 'GET'],
      ['http://localhost:3001/reports/assignment-id/export', 'GET'],
    ]);
  });
});
