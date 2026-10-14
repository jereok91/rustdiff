import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { applySavedLanguage } from "./i18n";
import { applySavedTheme } from "./lib/theme";
import "./styles.css";

// El tema guardado (o el del sistema) se aplica antes de pintar nada.
applySavedTheme();

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
