// Discovery + curated ordering for the PM plugin marketplace entries.
// Used by both the generator (build time) and the marketplace-manifest test.
// Single source of truth so the test can never drift from the generator.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const PM_PLUGIN_CATEGORY = "product-management";
// Curated display order (product-journey flow).
// Plugins on disk that aren't in this list are appended alphabetically.
export const PM_PLUGIN_ORDER = [
    "pm-product-discovery",
    "pm-product-strategy",
    "pm-execution",
    "pm-market-research",
    "pm-data-analytics",
    "pm-go-to-market",
    "pm-marketing-growth",
    "pm-toolkit",
];
export function discoverPmMarketplaceEntries(pluginsDir) {
    const entries = readdirSync(pluginsDir, { withFileTypes: true });
    const pmDirs = entries
        .filter((e) => e.isDirectory() && e.name.startsWith("pm-"))
        .map((e) => e.name);
    const orderIndex = new Map(PM_PLUGIN_ORDER.map((name, i) => [name, i]));
    pmDirs.sort((a, b) => {
        const ia = orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
        const ib = orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
        if (ia !== ib)
            return ia - ib;
        return a.localeCompare(b);
    });
    const result = [];
    for (const dir of pmDirs) {
        const manifestPath = join(pluginsDir, dir, ".claude-plugin", "plugin.json");
        let raw;
        try {
            raw = readFileSync(manifestPath, "utf8");
        }
        catch {
            continue;
        }
        const parsed = JSON.parse(raw);
        if (!parsed.author?.name) {
            throw new Error(`plugins/${dir}/.claude-plugin/plugin.json is missing author.name`);
        }
        result.push({
            name: parsed.name,
            description: parsed.description,
            version: parsed.version,
            source: `./plugins/${dir}`,
            author: {
                name: parsed.author.name,
                ...(parsed.author.email ? { email: parsed.author.email } : {}),
                ...(parsed.author.url ? { url: parsed.author.url } : {}),
            },
            category: PM_PLUGIN_CATEGORY,
            homepage: parsed.homepage ?? "",
        });
    }
    return result;
}
