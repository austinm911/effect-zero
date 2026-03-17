import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDirPath, "..");
const sourcePath = path.join(repoRoot, "seed.sql.data");
const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5438/effect_zero";
const databaseUrl =
  process.env.EFFECT_ZERO_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.PGURL?.trim() ||
  defaultDatabaseUrl;
const artistHeader =
  "INSERT INTO artist (id, name, sort_name, type, begin_date, end_date, popularity) VALUES";
const albumHeader = "INSERT INTO public.album (id, artist_id, title, year) VALUES";

async function main() {
  const sourceText = await readFile(sourcePath, "utf8");
  const transformed = transformSeed(sourceText);

  if (process.argv.includes("--sql-only")) {
    process.stdout.write(transformed.sql);
    return;
  }

  await runPsql(transformed.sql);
  console.log(
    JSON.stringify({
      event: "ztunes-seed-loaded",
      sourcePath,
      databaseUrl,
      artistCount: transformed.artistCount,
      albumCount: transformed.albumCount,
    }),
  );
}

function transformSeed(sourceText) {
  const albumHeaderIndex = sourceText.indexOf(albumHeader);
  if (albumHeaderIndex === -1) {
    throw new Error(`missing album header: ${albumHeader}`);
  }

  const artistSection = sourceText.slice(0, albumHeaderIndex).trim();
  const albumSection = sourceText.slice(albumHeaderIndex + albumHeader.length).trim();

  if (!artistSection.startsWith(artistHeader)) {
    throw new Error(`unexpected artist header in ${sourcePath}`);
  }

  const artistRowLines = readTupleLines(artistSection.slice(artistHeader.length));
  const albumRowLines = readTupleLines(albumSection);

  const transformedArtistRows = artistRowLines.map((rowLine) => {
    const row = splitTupleValues(rowLine);
    if (row.length !== 7) {
      throw new Error(`expected 7 artist columns, received ${row.length}`);
    }
    return `(${[row[0], row[1], row[2], row[3], row[6]].join(", ")})`;
  });

  for (const rowLine of albumRowLines) {
    const row = splitTupleValues(rowLine);
    if (row.length !== 4) {
      throw new Error(`expected 4 album columns, received ${row.length}`);
    }
  }

  const sql = [
    "BEGIN;",
    "TRUNCATE TABLE cart_item, album, artist;",
    "INSERT INTO artist (id, name, sort_name, type, popularity) VALUES",
    `${transformedArtistRows.join(",\n")};`,
    "INSERT INTO album (id, artist_id, title, year) VALUES",
    `${albumRowLines.join(",\n")};`,
    "COMMIT;",
    "",
  ].join("\n");

  return {
    sql,
    artistCount: transformedArtistRows.length,
    albumCount: albumRowLines.length,
  };
}

function readTupleLines(sectionText) {
  return sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("("))
    .map((line) => line.replace(/[;,]$/, "").trim());
}

function splitTupleValues(tupleLine) {
  if (!tupleLine.startsWith("(") || !tupleLine.endsWith(")")) {
    throw new Error(`invalid tuple line: ${tupleLine.slice(0, 120)}`);
  }

  const inner = tupleLine.slice(1, -1);
  const values = [];
  let current = "";
  let inString = false;

  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];

    if (character === "'") {
      current += character;
      if (inString && inner[index + 1] === "'") {
        current += "'";
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (character === "," && !inString) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

async function runPsql(sql) {
  await new Promise((resolve, reject) => {
    const child = spawn("psql", ["-v", "ON_ERROR_STOP=1", databaseUrl], {
      stdio: ["pipe", "inherit", "inherit"],
      env: {
        ...process.env,
        PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`psql exited with code ${code}`));
    });

    child.stdin.end(sql);
  });
}

await main();
