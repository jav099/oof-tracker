# OOF Tracker

## Run locally

```bash
cd /Users/javiercon/projects/oof-tracker
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Change tracking year (2027+)

```bash
cd /Users/javiercon/projects/oof-tracker
node scripts/set-year.mjs 2027
```

This updates `config.js`. After running it, refresh the app.

## Notes

- Data is stored in `localStorage` under a year-specific key.
- Export/Import JSON can be used to back up or transfer entries.
