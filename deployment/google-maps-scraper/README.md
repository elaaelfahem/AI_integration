# Google Maps Scraper

This local service provides richer Google Maps discovery without a Google API key. It is used for the `google_maps_scraper` source and stores its temporary job data in `data/`.

Start it:

```bash
docker compose -f deployment/google-maps-scraper/docker-compose.yml up -d
```

Local interface: http://localhost:8082

Small searches can run without a proxy. Larger runs may be rate-limited by Google and can later be configured with a proxy.
