# Promise Target

Verify the Promise control target end to end at `http://effect-zero-ztunes.localhost:1355`.

## Assertions

1. Home route loads and shows the target tabs plus the artist search input.
2. Clicking the `Promise` tab sets `document.cookie` so `effect-zero-target=control`.
3. Searching for `Portishead` leaves at least one artist result visible.
4. Opening the artist page and clicking `Add to cart` changes the cart badge from `Cart (0)` to `Cart (1)`.
5. Opening the cart page and clicking `Remove` returns the badge to `Cart (0)` and shows `No items in cart.`

## Suggested CDP Flow

1. Navigate to the app root.
2. Use `eval` or `snap` to confirm the page rendered and includes `Search artists`.
3. Use `click` or `eval` to activate the `Promise` button.
4. Use `eval` to confirm `document.cookie.includes("effect-zero-target=control")`.
5. Navigate to the app root again so the next request is unambiguously on the selected target.
6. Use `eval` with the native `HTMLInputElement` value setter plus `InputEvent` to set the search field to `Portishead`.
7. Wait until the result list contains `Portishead` as a substring. Do not require an exact `Portishead` link label because the rendered row text is `Portishead65`.
8. Click the matching artist link whose `href` starts with `/artist?id=`.
9. Click the first exact `Add to cart` button.
10. Wait until the artist page shows `Cart (1)` and `Remove from cart`.
11. Click the `Cart (1)` link.
12. Click the exact `Remove` button.
13. Wait until the page shows `No items in cart.` and the badge reads `Cart (0)`.
