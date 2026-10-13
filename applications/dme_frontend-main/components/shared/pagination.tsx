'use client';

function buildPageItems(
  current: number,
  total: number,
): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const items: (number | 'ellipsis')[] = [1];
  if (current > 4) items.push('ellipsis');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let page = start; page <= end; page++) items.push(page);
  if (current < total - 3) items.push('ellipsis');
  items.push(total);
  return items;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  ariaLabel,
  prevLabel,
  nextLabel,
  rowsPerPageLabel,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
  rowsPerPageLabel: string;
}) {
  const items = buildPageItems(page, pageCount);
  return (
    <nav className="users-pagination" aria-label={ariaLabel}>
      <label className="users-page-size">
        <span>{rowsPerPageLabel}</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="users-pagination-pages">
        <button
          type="button"
          aria-label={prevLabel}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹
        </button>
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="pagination-ellipsis"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={item === page ? 'active' : undefined}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label={nextLabel}
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </button>
      </div>
    </nav>
  );
}
