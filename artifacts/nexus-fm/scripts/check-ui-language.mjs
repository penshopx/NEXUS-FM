import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const appRoot = path.resolve(import.meta.dirname, "..");
const sourceRoots = [
  path.join(appRoot, "src", "pages"),
  path.join(appRoot, "src", "components"),
];

const userFacingAttributes = new Set([
  "alt",
  "aria-label",
  "placeholder",
  "title",
]);

// Stable product names, technical abbreviations, and machine values are not
// translatable UI copy. Keep this list exact so it cannot hide whole phrases.
const allowedTerms = new Set([
  "ACTIVE",
  "ALL",
  "ALLOW",
  "API",
  "ASSET",
  "ASSIGNED",
  "AUDIT_LOG.VIEW_AUDIT",
  "BUILDING",
  "CSV",
  "DENY",
  "EXISTING_FACILITY",
  "EXPIRED",
  "FACILITY",
  "FACILITY_MANAGER",
  "FACILITY_SUPERVISOR",
  "ID",
  "INACTIVE",
  "INSPECTOR",
  "MAINTENANCE_TECHNICIAN",
  "MINIMUM_RBAC",
  "MISSING",
  "N/A",
  "NEXUS-FM",
  "NEW_FACILITY",
  "NOT_APPLICABLE",
  "404_NOT_FOUND",
  "ORGANIZATION",
  "ORGANIZATION.VIEW",
  "OWNED_REQUEST",
  "PDF",
  "PLATFORM",
  "PLATFORM_ADMIN",
  "PORTFOLIO",
  "RBAC",
  "READY",
  "RESOLVED",
  "ROLE_BINDING",
  "ROLE.MANAGE",
  "SPACE",
  "SUSPENDED",
  "SYSTEM",
  "TATABANGUN",
  "TEAM",
  "USER.MANAGE",
  "USER.VIEW",
  "VENDOR",
  "VENDOR_ASSIGNMENT",
  "WAREHOUSE_SUPERVISOR",
  "member-access-review.csv",
  "portfolio-import-errors.csv",
  "portfolio-import-template.csv",
  "policyVersion",
]);

// These are standard Indonesian loanwords recorded by KBBI, not untranslated
// English. Matching remains case-insensitive and word-based.
const indonesianLoanwords = new Set(["email", "filter", "status"]);

// Common interface words that must not return to Indonesian-owned surfaces.
// Word boundaries prevent identifiers such as `downloadUrl` from matching.
const englishUiWords = new Set([
  "access",
  "account",
  "action",
  "add",
  "apply",
  "back",
  "cancel",
  "change",
  "clear",
  "close",
  "confirm",
  "continue",
  "create",
  "delete",
  "denied",
  "description",
  "details",
  "disabled",
  "download",
  "edit",
  "email",
  "empty",
  "enabled",
  "error",
  "failed",
  "filter",
  "finish",
  "first",
  "home",
  "import",
  "last",
  "loading",
  "more",
  "name",
  "new",
  "next",
  "no",
  "not",
  "open",
  "previous",
  "remove",
  "reset",
  "retry",
  "role",
  "save",
  "search",
  "select",
  "settings",
  "status",
  "submit",
  "success",
  "upload",
  "user",
  "view",
  "warning",
  "yes",
]);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) return [];
    return [entryPath];
  });
}

function literalParts(expression) {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return [expression.text];
  }
  if (ts.isTemplateExpression(expression)) {
    return [
      expression.head.text,
      ...expression.templateSpans.map((span) => span.literal.text),
    ];
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...literalParts(expression.whenTrue),
      ...literalParts(expression.whenFalse),
    ];
  }
  if (ts.isParenthesizedExpression(expression)) {
    return literalParts(expression.expression);
  }
  return [];
}

function normalize(text) {
  let normalized = text.replace(/\s+/g, " ").trim();
  for (const term of [...allowedTerms].sort((a, b) => b.length - a.length)) {
    normalized = normalized.replaceAll(term, " ");
  }
  return normalized;
}

function untranslatedWords(text) {
  const normalized = normalize(text);
  return [
    ...new Set(
      normalized
        .match(/[A-Za-z]+/g)
        ?.map((word) => word.toLowerCase())
        .filter(
          (word) =>
            englishUiWords.has(word) && !indonesianLoanwords.has(word),
        ) ?? [],
    ),
  ];
}

const findings = [];

function inspectText(file, sourceFile, node, text, surface) {
  const words = untranslatedWords(text);
  if (words.length === 0) return;
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push({
    file: path.relative(appRoot, file),
    line: position.line + 1,
    surface,
    text: text.replace(/\s+/g, " ").trim(),
    words,
  });
}

for (const file of sourceRoots.flatMap(sourceFiles)) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (ts.isJsxText(node)) {
      inspectText(file, sourceFile, node, node.text, "teks JSX");
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      !ts.isJsxAttribute(node.parent)
    ) {
      for (const text of literalParts(node.expression)) {
        inspectText(file, sourceFile, node, text, "ekspresi JSX");
      }
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (userFacingAttributes.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          inspectText(file, sourceFile, node, node.initializer.text, name);
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression
        ) {
          for (const text of literalParts(node.initializer.expression)) {
            inspectText(file, sourceFile, node, text, name);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (findings.length > 0) {
  console.error("Teks antarmuka berbahasa Inggris ditemukan:\n");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} (${finding.surface}, kata: ${finding.words.join(", ")}): ${JSON.stringify(finding.text)}`,
    );
  }
  console.error(
    "\nTerjemahkan copy pengguna. Hanya tambahkan nama produk atau nilai mesin yang stabil ke allowedTerms.",
  );
  process.exitCode = 1;
} else {
  console.log("Pemeriksaan bahasa UI lulus.");
}