import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "#app/zero/queries.ts";
import { mutators } from "#app/zero/mutators.ts";
import type { CSSProperties } from "react";

export const Route = createFileRoute("/_layout/artist")({
  component: ArtistPage,
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  loaderDeps: ({ search }) => ({ artistId: search.id }),
  loader: async ({ context, deps: { artistId } }) => {
    if (artistId) void context.zero.run(queries.getArtist({ artistId }));
  },
});

function ArtistPage() {
  const { zero } = useRouter().options.context;
  const { id: artistId } = Route.useSearch();

  if (!artistId) return <div>Missing artist ID</div>;

  const [artist, { type }] = useQuery(queries.getArtist({ artistId }));

  if (!artist && type === "complete") return <div>Artist not found</div>;
  if (!artist) return null;

  return (
    <div>
      <h1 style={{ margin: "0 0 16px 0" }}>{artist.name}</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {artist.albums.map((album) => {
          const inCart = album.cartItems.length > 0;
          return (
            <div key={album.id} style={albumRowStyle}>
              <div>
                <strong>{album.title}</strong>
                <span style={{ color: "#a1a1aa", marginLeft: 8 }}>({album.year ?? "?"})</span>
              </div>
              <button
                type="button"
                style={inCart ? removeButtonStyle : addButtonStyle}
                onClick={() => {
                  if (inCart) {
                    zero.mutate(mutators.cart.remove({ albumId: album.id }));
                  } else {
                    zero.mutate(mutators.cart.add({ albumId: album.id, addedAt: Date.now() }));
                  }
                }}
              >
                {inCart ? "Remove from cart" : "Add to cart"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const albumRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
};

const addButtonStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: "0.8125rem",
  fontWeight: 500,
  fontFamily: "inherit",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  background: "#fff",
  color: "#09090b",
};

const removeButtonStyle: CSSProperties = {
  ...addButtonStyle,
  background: "#09090b",
  color: "#fafafa",
  borderColor: "#09090b",
};
