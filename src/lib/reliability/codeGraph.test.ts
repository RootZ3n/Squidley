import { describe, it, expect } from "vitest";
import {
  HEAVY_DIRS_TO_IGNORE,
  indexCodeGraph,
  queryCodeGraph,
  type CodeGraphIndexer,
} from "@/lib/reliability/codeGraph";

function fakeIndexer(
  tree: Record<string, { isDirectory: boolean; size?: number; children?: string[]; body?: string }>,
): CodeGraphIndexer {
  return {
    async readDir(path) {
      const node = tree[path];
      if (!node || !node.isDirectory) throw new Error(`not a dir: ${path}`);
      return (node.children ?? []).map((name) => {
        const full = path === "/" ? `/${name}` : `${path}/${name}`;
        const child = tree[full];
        return {
          name,
          isDirectory: child?.isDirectory ?? false,
          size: child?.size,
        };
      });
    },
    async readFile(path) {
      const node = tree[path];
      if (!node || node.isDirectory) throw new Error(`not a file: ${path}`);
      return node.body ?? "";
    },
  };
}

describe("reliability/codeGraph", () => {
  it("ignores heavy directories", async () => {
    const tree = {
      "/repo": { isDirectory: true, children: ["node_modules", "src", ".git", ".next"] },
      "/repo/node_modules": { isDirectory: true, children: ["some-pkg"] },
      "/repo/node_modules/some-pkg": { isDirectory: true, children: ["index.js"] },
      "/repo/node_modules/some-pkg/index.js": { isDirectory: false, body: "module.exports = {}" },
      "/repo/src": { isDirectory: true, children: ["index.ts"] },
      "/repo/src/index.ts": { isDirectory: false, body: "export function hello() {}" },
      "/repo/.git": { isDirectory: true, children: [] },
      "/repo/.next": { isDirectory: true, children: [] },
    };
    const graph = await indexCodeGraph(fakeIndexer(tree), { rootPath: "/repo" });
    // node_modules content must not show up as a node.
    expect(graph.nodes.find((n) => n.path.includes("node_modules"))).toBeUndefined();
    expect(graph.nodes.find((n) => n.name === "index" && n.path === "/repo/src/index.ts")).toBeTruthy();
    expect(graph.skipped.some((s) => s.reason === "heavy-dir-ignored")).toBe(true);
  });

  it("indexes exported symbols with conservative regex", async () => {
    const tree = {
      "/repo": { isDirectory: true, children: ["a.ts"] },
      "/repo/a.ts": {
        isDirectory: false,
        body:
          "export function foo() {}\n" +
          "export const bar = 1;\n" +
          "export class Baz {}\n" +
          "function private_helper() {}\n",
      },
    };
    const graph = await indexCodeGraph(fakeIndexer(tree), { rootPath: "/repo" });
    const node = graph.nodes.find((n) => n.path === "/repo/a.ts")!;
    expect(node.exports).toContain("foo");
    expect(node.exports).toContain("bar");
    expect(node.exports).toContain("Baz");
    expect(node.exports).not.toContain("private_helper");
  });

  it("respects file size limits", async () => {
    const tree = {
      "/repo": { isDirectory: true, children: ["huge.ts"] },
      "/repo/huge.ts": { isDirectory: false, size: 999_999, body: "export const x = 1;" },
    };
    const graph = await indexCodeGraph(fakeIndexer(tree), { rootPath: "/repo", maxFileBytes: 1024 });
    expect(graph.nodes.length).toBe(0);
    expect(graph.skipped.some((s) => /too-large/.test(s.reason))).toBe(true);
  });

  it("respects maxNodes cap", async () => {
    const children = Array.from({ length: 10 }, (_, i) => `f${i}.ts`);
    const tree: Record<string, { isDirectory: boolean; size?: number; children?: string[]; body?: string }> = {
      "/repo": { isDirectory: true, children },
    };
    for (const name of children) {
      tree[`/repo/${name}`] = { isDirectory: false, body: "export const x = 1;" };
    }
    const graph = await indexCodeGraph(fakeIndexer(tree), { rootPath: "/repo", maxNodes: 3 });
    expect(graph.nodes.length).toBeLessThanOrEqual(3);
  });

  it("queryCodeGraph returns the most relevant node first", async () => {
    const tree = {
      "/repo": { isDirectory: true, children: ["chat.ts", "vegetables.ts"] },
      "/repo/chat.ts": { isDirectory: false, body: "export function handleChat() {}" },
      "/repo/vegetables.ts": { isDirectory: false, body: "export const carrot = 1;" },
    };
    const graph = await indexCodeGraph(fakeIndexer(tree), { rootPath: "/repo" });
    const results = queryCodeGraph(graph, { question: "how does chat work" });
    expect(results[0]?.path).toBe("/repo/chat.ts");
  });

  it("HEAVY_DIRS_TO_IGNORE includes expected entries", () => {
    expect(HEAVY_DIRS_TO_IGNORE).toContain("node_modules");
    expect(HEAVY_DIRS_TO_IGNORE).toContain(".git");
    expect(HEAVY_DIRS_TO_IGNORE).toContain(".next");
    expect(HEAVY_DIRS_TO_IGNORE).toContain("dist");
  });
});
