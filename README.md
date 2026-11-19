# Basvaror for Home Assistant

Track pantry staples and automatically put the amount you need on your Home Assistant shopping list. The dashboard controls are in Swedish. Everything runs in your own Home Assistant instance using its normal signed-in session. The card requires no separate credentials, API key, or external service. If your Home Assistant instance requires sign-in, use your own Home Assistant credentials.

## Setup

1. In Home Assistant, enable the built-in [Shopping List](https://www.home-assistant.io/integrations/shopping_list/) integration if you don't already have it. Its usual entity ID is `todo.shopping_list`.
2. In **To-do lists**, open the list picker, choose **Create list**, and name the new [Local to-do](https://www.home-assistant.io/integrations/local_todo/) list **Basvarulager**. This is the inventory store. Verify its entity ID under **Settings → Devices & services → Entities**. The examples use `todo.basvarulager`.
3. Under **Settings → Automations & scenes**, create a new blank automation. Open its three-dot menu, choose **Edit in YAML**, and paste [automation.yaml](automation.yaml) into the editor. If your entity IDs differ, adjust the trigger and variables before saving. After saving, check the automation's entity ID in its settings.
4. Copy [basvaror-card.js](basvaror-card.js) into the `www` folder next to your Home Assistant `configuration.yaml`. If you just created `www`, restart Home Assistant once. Open **Settings → Dashboards → ⋮ → Resources**, add `/local/basvaror-card.js?v=1` as a **JavaScript module**, and reload the browser. If Resources is hidden, enable **Advanced mode** in your Home Assistant profile. See [Register resources](https://contributors.home-assistant.io/frontend/custom-ui/resources/).
5. Edit the dashboard and add a **Manual** card. Paste [dashboard-card.yaml](dashboard-card.yaml), replacing the example entity IDs with yours if needed. The inventory list must be separate from the shopping list.

## Use

- **Lägg till basvara** adds a staple with a name, current stock, and minimum. For a quick check, add **Pasta** with 1 in stock and a minimum of 3. The shopping list should show **Pasta — 2 st**.
- **Sök basvaror** filters by part of the name as you type. You can type Swedish letters without accents.
- **Använd en** subtracts one unit. **Detaljer** lets you rename a staple, update its stock after shopping, or change its minimum.
- **Uppdatera inköpslistan** reloads the inventory and runs the shopping automation again. Use it after editing the underlying Local to-do list outside the card.

The automation buys up to the minimum by showing the difference on the shopping list. It updates matching active entries and completes a generated entry when the stock reaches the minimum. It displays counts in `st`, with `kartong` or `kartonger` for an item named **Mjölk**. Checking off a purchase in the shopping list does not update inventory. Update **I lager** after restocking, otherwise a later sync can put a still-needed item back on the shopping list.

## Troubleshooting

- **Custom element doesn't exist** — verify that the resource URL opens and that its type is **JavaScript module**, then reload Home Assistant in the browser. When updating the file, increment the resource URL version.
- **Stock cards load but purchase amounts don't update** — verify the automation entity ID in the card, check that the automation is enabled, and open its **Traces** after clicking **Uppdatera inköpslistan**.
- **A card is missing after editing the inventory list directly** — inventory rows use `Name | stock | minimum` with whole numbers. Use the dashboard form for normal edits.