import { drizzleZeroConfig } from "drizzle-zero";
import * as drizzleSchema from "./src/db/schema";

export default drizzleZeroConfig(drizzleSchema, {
  tables: {
    album: {
      artistId: true,
      id: true,
      title: true,
      year: true,
    },
    artist: {
      id: true,
      name: true,
      popularity: true,
      sortName: true,
      type: true,
    },
    cartItem: {
      addedAt: true,
      albumId: true,
      userId: true,
    },
  },
});
