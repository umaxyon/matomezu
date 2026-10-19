import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../web/src/App";

afterEach(cleanup);

test("App が描ける", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "matomezu" })).toBeTruthy();
});
