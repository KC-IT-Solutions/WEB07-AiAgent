# TASK-0109: fix-fred-series-metadata-response-shape

## Problem
The existing fred_data Tool fails for valid FRED series IDs such as GDPC1 and GDP with:
```json
{
  "success": false,
  "error": {
    "code": "FRED_DATA_FAILED",
    "message": "Unexpected response from the economic data provider."
  }
}
```

The defect is in parsing the FRED /fred/series response. The parser reads `.series` but FRED's metadata endpoint uses the JSON property `seriess` for the returned series array.

## Goal
Correct fred_data metadata parsing so valid FRED series IDs successfully return metadata and observations.

## Fix
- Update parseFredMetadata() to read `data.seriess` instead of `data.series`
- Update test fixtures from `series:` to `seriess:`
- Add regression tests for malformed/missing seriess scenarios
