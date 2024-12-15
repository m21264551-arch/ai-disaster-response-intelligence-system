import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  use: { baseURL: "http://127.0.0.1:5181", screenshot: "only-on-failure" },
  webServer: [
    {
      command: `cd .. && PYTHONPATH=.:backend ${process.env.PYTHON || "python3"} -m uvicorn api.index:app --host 127.0.0.1 --port 8008`,
      url: "http://127.0.0.1:8008/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5181",
      url: "http://127.0.0.1:5181",
      reuseExistingServer: !process.env.CI,
    },
  ],
  reporter: "list",
});
