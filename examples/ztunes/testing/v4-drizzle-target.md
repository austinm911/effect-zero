# Effect v4 Drizzle Target

Verify the browser-visible `v4-drizzle` target end to end at `http://127.0.0.1:4310`.

## Assertions

1. Home route loads and shows the target tabs plus the artist search input.
2. Clicking the `Effect v4 (Drizzle)` tab sets `document.cookie` so `effect-zero-target=v4-drizzle`.
3. Searching for `Portishead` leaves at least one artist result visible.
4. Opening the artist page and clicking `Add to cart` changes the cart badge from `Cart (0)` to `Cart (1)`.
5. Opening the cart page and clicking `Remove` returns the badge to `Cart (0)` and shows `No items in cart.`
6. The non-control requests are served through the package harness and report `x-effect-zero-server-db-api=wrapped-transaction`.

## Suggested CDP Flow

1. Navigate to the app root.
2. Use `eval` or `snap` to confirm the page rendered and includes `Search artists`.
3. Use `click` or `eval` to activate the `Effect v4 (Drizzle)` button.
4. Use `eval` to confirm `document.cookie.includes("effect-zero-target=v4-drizzle")`.
5. Navigate to the app root again so the next request is unambiguously on the selected target.
6. Use `eval` with the native `HTMLInputElement` value setter plus `InputEvent` to set the search field to `Portishead`.
7. Wait until the result list contains `Portishead` as a substring. Do not require an exact `Portishead` link label because the rendered row text is `Portishead65`.
8. Click the matching artist link whose `href` starts with `/artist?id=`.
9. Click the first exact `Add to cart` button.
10. Wait until the artist page shows `Cart (1)` and `Remove from cart`.
11. Use `eval` or CDP network inspection to confirm the most recent mutate/read response includes `x-effect-zero-server-db-api=wrapped-transaction`.
12. Click the `Cart (1)` link.
13. Click the exact `Remove` button.
14. Wait until the page shows `No items in cart.` and the badge reads `Cart (0)`.
