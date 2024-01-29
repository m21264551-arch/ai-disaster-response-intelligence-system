# Data Sources And Licenses

This project is a portfolio/demo system. It is not an official emergency-response tool and must not be used for operational decisions.

The root MIT license applies to this repository's original source code and documentation. Public data samples and derived artifacts retain the attribution and license context of their upstream sources.

## Included Data Artifacts

The repository includes compact historical samples and derived model artifacts so the demo is reproducible without live credentials:

- `backend/app/data/historical_hotspots_sample.csv`
- `backend/app/data/heldout_hotspots_sample.csv`
- `backend/app/data/multiseason_national_hotspots_sample.csv`
- `backend/app/data/multiseason_national_manifest.json`
- `backend/app/data/bom_weather_observations_sample.csv`
- `backend/app/data/abs_population_h3_sample.csv`
- `backend/app/ml/artifacts/training_dataset.csv`
- `backend/app/ml/artifacts/heldout_dataset.csv`
- `backend/app/ml/artifacts/heldout_predictions.csv`
- `backend/app/ml/artifacts/*.json`
- `backend/app/ml/artifacts/bushfire_risk_model.joblib`

These are demonstration artifacts derived from public hotspot data. They are not authoritative incident records.

## Digital Earth Australia Hotspots

Primary training and held-out samples come from Digital Earth Australia Hotspots WFS, provided by Geoscience Australia:

- Source: https://ecat.ga.gov.au/geonetwork/srv/api/records/8722a8d5-3713-40d8-90f0-a123d1982198
- Access endpoint: https://hotspots.dea.ga.gov.au/geoserver/wfs
- License: Creative Commons Attribution 4.0 International Licence
- Attribution: Commonwealth of Australia (Geoscience Australia)

The DEA metadata describes the service as part of the national bushfire monitoring system and lists the resource constraint title as Creative Commons Attribution 4.0 International Licence.

## NSW Rural Fire Service Feeds

The demo supports the NSW RFS public incident GeoJSON feed:

- Feed page: https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds
- Data NSW resource: https://data.nsw.gov.au/data/dataset/nsw-rural-fire-service-current-incidents-feed/resource/c2cb1807-e7ca-4962-851f-c2eeda9e5a69
- Feed URL: https://www.rfs.nsw.gov.au/feeds/majorIncidents.json
- License: Creative Commons Attribution
- Requested attribution: © State of New South Wales (NSW Rural Fire Service). For current information go to www.rfs.nsw.gov.au.

The local default mode uses deterministic replay fixtures, so the public repository does not depend on this live feed to render the dashboard.

## NASA FIRMS

NASA FIRMS ingestion is implemented as an optional script and requires a free `FIRMS_MAP_KEY`:

- FIRMS page: https://www.earthdata.nasa.gov/data/tools/firms
- NASA data use guidance: https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance

NASA states that FIRMS data is available under full and open sharing guidance, asks users to follow citation/disclaimer guidance when providing FIRMS data or imagery to third parties, and notes that near-real-time fire data is not advised for tactical local decision-making.

This repository does not include a FIRMS API key.

## OpenStreetMap

The optional OSM exposure overlay can be downloaded with `make download-osm`.

- Source: OpenStreetMap via Overpass API
- Overpass endpoint used by the script: https://overpass-api.de/api/interpreter
- License: Open Data Commons Open Database License (ODbL) 1.0
- Attribution: © OpenStreetMap contributors
- License reference: https://opendatacommons.org/licenses/odbl/

The repository does not commit an OSM extract by default. If `backend/app/data/osm_infrastructure_sample.csv` is generated and published later, treat that file as OSM-derived data and preserve the ODbL attribution/share-alike context.

## Dashboard Basemap

The React dashboard uses the public CARTO Dark Matter MapLibre style, which is based on OpenStreetMap data. The map attribution control is enabled in the dashboard so CARTO/OpenStreetMap attribution is visible at runtime.

## ABS Population Grid

The exposure overlay can aggregate the ABS Australian Population Grid GeoTIFF into H3 cells:

- Source page: https://www.abs.gov.au/statistics/people/population/regional-population/latest-release
- Download used by the script: https://www.abs.gov.au/statistics/people/population/regional-population/2024-25/GEOTIFF.zip
- Included derived artifact: `backend/app/data/abs_population_h3_sample.csv`
- Attribution: Australian Bureau of Statistics

The committed H3 file is a derived, aggregated exposure layer for demo/model features. It is not a substitute for official ABS statistics at their published geography.

## Bureau Of Meteorology Weather Observations

The weather feature join uses public Bureau of Meteorology daily evapotranspiration/weather station tables:

- Source root used by the script: `ftp://ftp.bom.gov.au/anon/gen/clim_data/IDCKWCDEA0/tables/`
- Station metadata file: `ftp://ftp.bom.gov.au/anon/gen/clim_data/IDCKWCDEA0/tables/stations_db.txt`
- Included derived artifact: `backend/app/data/bom_weather_observations_sample.csv`
- Attribution: Australian Government Bureau of Meteorology

The committed sample covers selected NSW, VIC, QLD, SA, and WA stations from November 2019 through January 2020. Feature generation only joins observations from completed days before the prediction timestamp.

## Publication Notes

- Keep `.env` and `.env.*` files private.
- Do not commit live API keys, precise private locations, or emergency-service-only data.
- Keep the operational disclaimer visible in the README, model card, and dashboard.
- If replacing sample CSVs with new public data, re-check the source license and update this document.
