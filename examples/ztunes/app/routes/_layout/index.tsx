import { useState, useDeferredValue } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "#app/zero/queries.ts";
import type { CSSProperties } from "react";

export const Route = createFileRoute("/_layout/")({
  component: Home,
  ssr: false,
});

function Home() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [artists] = useQuery(queries.listArtists({ search: deferredSearch, limit: 50 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: "0 0 8px 0" }}>Search artists</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Try Radiohead or Miles..."
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {artists.map((artist) => (
          <Link key={artist.id} to="/artist" search={{ id: artist.id }} style={artistLinkStyle}>
            <span style={{ fontWeight: 500 }}>{artist.name}</span>
            <span style={{ color: "#a1a1aa", fontSize: "0.8125rem" }}>
              {artist.popularity ?? "—"}
            </span>
          </Link>
        ))}
        {artists.length === 0 && <p style={{ color: "#71717a", margin: 0 }}>No artists found.</p>}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: "0.9375rem",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
};

const artistLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  borderRadius: 8,
  textDecoration: "none",
  transition: "background 100ms",
};
