# CityVetHub Phase 4 Website

Local-only vanilla HTML/CSS/JavaScript CVO dashboard powered by Appwrite, Leaflet and Chart.js.

From the enclosing folder run `python -m http.server 8000 --directory ./cityvethub` and open `http://localhost:8000/login.html`. Complete one-time Appwrite setup first (`../START_HERE.md`). No hosted website is required for local development; QR links use the local page URL until you deploy, so public phone scanning across different networks will require hosting or an accessible development server.

Public passport page: `passport.html?pet=VERIFIED_PET_ID`. The page deliberately renders only approved public fields.

Source files: `scripts/registry-v4.js`, `scripts/phase4-features.js`, `scripts/features.js`, and `styles/phase4.css`.
