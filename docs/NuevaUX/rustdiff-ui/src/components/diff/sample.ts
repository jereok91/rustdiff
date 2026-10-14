/* Documentos de ejemplo (los mismos de la captura actual de RustDiff). */

const movimiento = (auxiliar: string, db: string, cr: string, co = "011") => ({
  F350_ID_CO: co,
  F350_ID_TIPO_DOCTO: "AJR",
  F351_BASE_GRAVABLE: "0",
  F351_DOCTO_BANCO: "",
  F351_ID_AUXILIAR: auxiliar,
  F351_ID_CCOSTO: "",
  F351_ID_CO_MOV: "011",
  F351_ID_FE: "",
  F351_ID_TERCERO: "830070527",
  F351_ID_UN: "01",
  F351_NOTAS: "Nota del comprobante en ERP - Consiglia",
  F351_NRO_DOCTO_BANCO: "0",
  F351_VALOR_CR: cr,
  F351_VALOR_DB: db,
  F_CIA: "001",
})

const documento = {
  F350_FECHA_DOCUMENTO: "20250701",
  F350_ID_CO: "011",
  F350_ID_TERCERO: "830070527",
  F350_ID_TIPO_DOCTO: "AJR",
  F350_IND_ESTADO: "1",
  F350_NOTAS: "Nota del comprobante en ERP - Consiglia",
  F351_ID_CCOSTO: "",
  F_CIA: "001",
}

export const leftDoc = {
  adjustments: { id: "d290f1ee-6c54-4b01-90e6-d701748f0851", type: "dataphonesSales" },
  register: {
    Documentocontable: [documento],
    Final: [{ F_CIA: "001" }],
    Inicial: [{ F_CIA: "001" }],
    Movimientocontable: [movimiento("1305200100", "1500", "0"), movimiento("1105051000", "0", "1500")],
  },
}

export const rightDoc = {
  adjustments: { id: "d290f1ee-6c54-4b01-90e6-d701748f0851", type: "dataphonesSale222s" },
  register: {
    Documentocontable: [documento],
    Fina32l: [{ F_CIA: "dd3001" }],
    Inicial: [{ F_CIA: "02201" }],
    Movimientocontable: [movimiento("1305200100", "1500", "0", "02211"), movimiento("1105051000", "0", "1500")],
  },
}
