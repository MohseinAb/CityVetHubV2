# Project Architectural Rules & Agent Guidelines

## Tech Stack & Architecture
* **Frontend:** Vanilla HTML5, CSS, and JavaScript. No frontend frameworks (e.g., React, Vue) are used.
* **Backend & Database:** Appwrite (Web SDK).
* **Routing/Structure:** The application uses a dynamic loading architecture. `index.html` acts as the main structural shell, while individual page logic and rendering are handled dynamically by files within the `scripts/` directory.

---

## Design & UI Constraints (Strict)
* **Preserve Existing Designs:** Do not radically alter the current CSS, layout, or color schemes unless explicitly instructed. 
* **Match Existing Styles:** When adding new UI elements, mimic the existing CSS classes and styling patterns found in the project.
* **No External Frameworks:** Do not introduce Tailwind CSS, Bootstrap, or other external CSS libraries. Stick to the existing vanilla CSS approach.
* **Minimal Refactoring:** Keep UI refactoring to an absolute minimum to avoid unintended visual regressions.

---

## JavaScript & Dynamic Loading Rules
* **DOM Manipulation:** All dynamic content injection should target the designated container elements in `index.html`.
* **Modularity:** Keep new JavaScript logic compartmentalized within the `scripts/` folder, separating API calls from DOM updates where possible.
* **Vanilla JS:** Use modern Vanilla JavaScript (ES6+). Do not use jQuery or suggest installing Node.js bundler dependencies unless asked.

---

## Appwrite Backend Rules
* **SDK Usage:** Use the official Appwrite Web SDK for all database, auth, and storage operations.
* **Client-Side Security:** Never expose Appwrite Server API keys in this frontend codebase. Only use the Project ID and API endpoint.
* **Data Integrity:** When writing queries or adding new database inserts, ensure the payload matches the existing implied schema used across the `scripts/` folder.

---

## Agent Operational Constraints
* **Read Before Writing:** Always review the specific script in the `scripts/` folder and the linked CSS before making structural changes to how a page loads.
* **Scope of Changes:** If a request asks for a functional update (e.g., "fix this Appwrite query"), do not bundle it with unsolicited CSS/design changes.