import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function databaseScopeIds(source) {
  const file = ts.createSourceFile("authorization.ts", source, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length) {
    throw new Error(`Cannot parse database authorization schema: ${file.parseDiagnostics[0].messageText}`);
  }

  let values;
  let enumUsesValues = false;
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (declaration.name.text === "scopeTypeValues") {
        const expression = declaration.initializer;
        const array = expression && ts.isAsExpression(expression) ? expression.expression : expression;
        if (!array || !ts.isArrayLiteralExpression(array) ||
            array.elements.length === 0 || array.elements.some((item) => !ts.isStringLiteral(item))) {
          throw new Error("Database scopeTypeValues must be a non-empty literal string array");
        }
        values = array.elements.map((item) => item.text);
      }
      if (declaration.name.text === "scopeTypeEnum") {
        const call = declaration.initializer;
        enumUsesValues = !!call && ts.isCallExpression(call) &&
          call.expression.getText(file) === "pgEnum" &&
          call.arguments[0] && ts.isStringLiteral(call.arguments[0]) &&
          call.arguments[0].text === "scope_type" &&
          call.arguments[1] && ts.isIdentifier(call.arguments[1]) &&
          call.arguments[1].text === "scopeTypeValues";
      }
    }
  }
  if (!values || !enumUsesValues) {
    throw new Error("Cannot find scopeTypeValues wired to the database scope_type enum");
  }
  return values;
}

export function openApiScopeIds(source) {
  // ScopeType is currently an inline YAML enum. Fail explicitly if its shape
  // changes, rather than silently comparing against an incomplete list.
  const schema = source.match(/^    ScopeType:\s*\r?\n((?:^ {6,}.*(?:\r?\n|$)|^\s*(?:\r?\n|$))*)/m)?.[1];
  if (!schema) throw new Error("Cannot find OpenAPI components.schemas.ScopeType");
  const matches = [...schema.matchAll(/^ {6}enum: \[([^\]\r\n]+)\]\s*$/gm)];
  if (matches.length !== 1) {
    throw new Error("OpenAPI ScopeType must contain exactly one inline enum list");
  }
  const values = matches[0][1].split(",").map((item) => item.trim().replace(/^(['"])(.*)\1$/, "$2"));
  if (values.length === 0 || values.some((item) => !/^[A-Z][A-Z0-9_]*$/.test(item))) {
    throw new Error("OpenAPI ScopeType enum contains an empty or invalid scope ID");
  }
  return values;
}

export function assertScopeIdsMatch(databaseIds, apiIds) {
  const unique = (ids, source) => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) throw new Error(`${source} ScopeType has duplicate IDs: ${[...new Set(duplicates)].join(", ")}`);
  };
  unique(databaseIds, "Database");
  unique(apiIds, "OpenAPI");

  const missingFromApi = databaseIds.filter((id) => !apiIds.includes(id));
  const missingFromDatabase = apiIds.filter((id) => !databaseIds.includes(id));
  if (missingFromApi.length || missingFromDatabase.length) {
    throw new Error(
      `ScopeType ID mismatch between database and OpenAPI:\n` +
      `  Database only: ${missingFromApi.join(", ") || "(none)"}\n` +
      `  OpenAPI only: ${missingFromDatabase.join(", ") || "(none)"}`,
    );
  }
  if (databaseIds.some((id, index) => id !== apiIds[index])) {
    throw new Error(
      `ScopeType ordering mismatch between database and OpenAPI:\n` +
      `  Database: ${databaseIds.join(", ")}\n` +
      `  OpenAPI:  ${apiIds.join(", ")}`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [database, spec] = await Promise.all([
      readFile(path.join(root, "lib/db/src/schema/authorization.ts"), "utf8"),
      readFile(path.join(root, "lib/api-spec/openapi.yaml"), "utf8"),
    ]);
    assertScopeIdsMatch(databaseScopeIds(database), openApiScopeIds(spec));
    console.log("Database and OpenAPI ScopeType IDs match.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}