import { describe, expect, it } from "vitest";

import {
    cleanSearchValue,
    extractKeyFromPath,
    itemJumpTargets,
    jumpTarget,
    locateItem,
    pathSegments,
    pathSyntax,
} from "@/lib/locate";

const slice = (text: string, range: { from: number; to: number } | null) =>
    range ? text.slice(range.from, range.to) : null;

// Mismos ejemplos que los tests de `src/ui/highlighter.rs`.
describe("cleanSearchValue (clean_search_value)", () => {
    it("clean_search_value_quita_comillas", () => {
        expect(cleanSearchValue('"hola"')).toBe("hola");
        expect(cleanSearchValue("42")).toBe("42");
        expect(cleanSearchValue('  "test"  ')).toBe("test");
        expect(cleanSearchValue("null")).toBe("null");
    });
});

describe("extractKeyFromPath (extract_key_from_path)", () => {
    it("extract_key_ruta_json", () => {
        expect(extractKeyFromPath("$.usuario.perfil.ciudad")).toBe("ciudad");
        expect(extractKeyFromPath("$.data")).toBe("data");
        expect(extractKeyFromPath("$")).toBe("$");
    });

    it("extract_key_ruta_con_indice", () => {
        expect(extractKeyFromPath("$.users[0].nombre")).toBe("nombre");
        expect(extractKeyFromPath("$.items[2]")).toBe("items");
    });

    it("extract_key_ruta_xml_atributo", () => {
        expect(extractKeyFromPath("server[@version]")).toBe("version");
        expect(extractKeyFromPath("config.db[@host]")).toBe("host");
    });

    it("extract_key_ruta_xml_texto", () => {
        expect(extractKeyFromPath("config.db.host.[text]")).toBe("host");
        expect(extractKeyFromPath("root.[text]")).toBe("root");
    });
});

describe("rutas", () => {
    it("reconoce la sintaxis por la forma de la ruta", () => {
        expect(pathSyntax("$.a")).toBe("json");
        expect(pathSyntax("$")).toBe("json");
        expect(pathSyntax("line[3]")).toBe("line");
        expect(pathSyntax("stmt[0]")).toBe("stmt");
        expect(pathSyntax("root.item[@id]")).toBe("xml");
    });

    it("descompone rutas JSON y XML en segmentos", () => {
        expect(pathSegments("$.users[1].nombre")).toEqual([
            { type: "key", name: "users" },
            { type: "index", index: 1 },
            { type: "key", name: "nombre" },
        ]);
        expect(pathSegments("config.db[@host]")).toEqual([
            { type: "key", name: "config" },
            { type: "key", name: "db" },
            { type: "attr", name: "host" },
        ]);
        expect(pathSegments("root.item[2].[text]")).toEqual([
            { type: "key", name: "root" },
            { type: "key", name: "item" },
            { type: "index", index: 2 },
        ]);
    });
});

describe("locateItem", () => {
    const doc = '{"usuario":{"nombre":"ana","edad":30},"tags":["a","b"]}';

    it("un valor corto no cae dentro de una clave (bug de la captura de F3)", () => {
        const found = locateItem(doc, "$.tags[1]", '"b"');
        expect(found.value).toEqual({ from: doc.indexOf('"b"') + 1, to: doc.indexOf('"b"') + 2 });
        expect(slice(doc, found.key)).toBe('"tags"');
        // `"a"` tampoco cae en `"usuario"` ni en `"ana"`.
        expect(locateItem(doc, "$.tags[0]", '"a"').value?.from).toBe(doc.indexOf('"a",') + 1);
    });

    it("los números se buscan como palabra y después de su clave", () => {
        const text = '{"a": 300, "b": {"edad": 30}}';
        const found = locateItem(text, "$.b.edad", "30");
        expect(found.value?.from).toBe(text.lastIndexOf("30"));
        expect(slice(text, found.key)).toBe('"edad"');
    });

    it("con claves repetidas, el índice de array elige el elemento correcto", () => {
        const text = '{"users": [{"nombre": "ana"}, {"nombre": "ana"}]}';
        const found = locateItem(text, "$.users[1].nombre", '"ana"');
        expect(found.key?.from).toBe(text.lastIndexOf('"nombre"'));
        expect(found.value?.from).toBe(text.lastIndexOf("ana"));
    });

    it("una clave igual a un valor se distingue por el `:`", () => {
        const text = '{"x": "id", "id": 7}';
        expect(slice(text, locateItem(text, "$.id", "7").key)).toBe('"id"');
        expect(locateItem(text, "$.id", "7").key?.from).toBe(text.indexOf('"id":'));
    });

    it("XML: atributos y texto anclados por la ruta", () => {
        const xml = '<config>\n  <db host="a" port="5432">a</db>\n</config>';
        const attr = locateItem(xml, "config.db[@host]", "a");
        expect(slice(xml, attr.key)).toBe("host");
        expect(attr.value?.from).toBe(xml.indexOf('"a"') + 1);
        const text = locateItem(xml, "config.db.[text]", "a");
        expect(text.value?.from).toBe(xml.indexOf(">a<") + 1);
    });

    it("sin valor encontrable, el salto va a la clave", () => {
        const xml = "<root>\n  <item/>\n</root>";
        expect(slice(xml, jumpTarget(xml, "root.item", "<item> 1 attr(s)"))).toBe("item");
    });

    it("line[N] salta a la línea completa", () => {
        expect(slice("uno\ndos\r\ntres", jumpTarget("uno\ndos\r\ntres", "line[2]", "dos"))).toBe("dos");
        expect(jumpTarget("uno", "line[5]", "x")).toBeNull();
    });

    it("sin token, cae en la búsqueda cruda sin mayúsculas de la GTK", () => {
        const sql = "SELECT * FROM users;";
        expect(jumpTarget(sql, "stmt[0]", "select * from users")).toEqual({ from: 0, to: 19 });
        expect(jumpTarget("{}", "$.x", '"nada"')).toBeNull();
    });
});

describe("itemJumpTargets (highlight_and_scroll_to_item)", () => {
    const left = '{"a": 1}';
    const right = '{"a": 2, "b": true}';

    it("cada lado busca su propio valor y un lado sin valor no se mueve", () => {
        expect(itemJumpTargets({ path: "$.a", left: "1", right: "2" }, left, right)).toEqual({
            left: { from: 6, to: 7 },
            right: { from: 6, to: 7 },
        });
        const added = itemJumpTargets({ path: "$.b", left: null, right: "true" }, left, right);
        expect(added.left).toBeNull();
        expect(slice(right, added.right)).toBe("true");
    });

    it("sin valores en ninguno de los lados, los dos buscan la clave", () => {
        const targets = itemJumpTargets({ path: "$.a", left: null, right: null }, left, right);
        expect(slice(left, targets.left)).toBe('"a"');
        expect(slice(right, targets.right)).toBe('"a"');
    });
});
