import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { applySavedLanguage } from "./i18n";
import "./styles.css";

const raiz = document.getElementById("root");
if (!raiz) {
    throw new Error("falta el nodo #root en index.html");
}

// El idioma guardado se aplica antes del primer render para no parpadear en
// inglés; si las preferencias no responden, se queda el del sistema.
void applySavedLanguage().finally(() => {
    createRoot(raiz).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
});
