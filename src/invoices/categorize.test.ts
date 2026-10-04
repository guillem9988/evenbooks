import { describe, expect, it } from "vitest";
import { guessCategory, parseCategory } from "./categorize.js";

describe("guessCategory", () => {
  it("classifies common Spanish vendors", () => {
    expect(guessCategory("RENFE VIAJEROS SME SA")).toBe("TRAVEL");
    expect(guessCategory("Repsol Comercial de Productos Petrolíferos")).toBe("TRAVEL");
    expect(guessCategory("Adobe Systems Software Ireland")).toBe("SOFTWARE");
    expect(guessCategory("Restaurant Can Culleretes")).toBe("MEALS");
    expect(guessCategory("Telefónica de España SAU")).toBe("OFFICE");
  });

  it("falls back to the document text and returns null when nothing matches", () => {
    expect(guessCategory("Serveis Garcia SL", "Allotjament web i domini anual")).toBe("SOFTWARE");
    expect(guessCategory("Serveis Garcia SL", "Assessorament")).toBeNull();
    expect(guessCategory(null)).toBeNull();
  });

  it("does not match inside other words", () => {
    expect(guessCategory("Barcelona Consulting")).toBeNull();
    expect(guessCategory("Cafè de l’Òpera")).toBe("MEALS");
    expect(guessCategory("Autopistes, peatge AP-7")).toBe("TRAVEL");
  });
});

describe("parseCategory", () => {
  it("accepts known categories in any case and rejects the rest", () => {
    expect(parseCategory("travel")).toBe("TRAVEL");
    expect(parseCategory(" SOFTWARE ")).toBe("SOFTWARE");
    expect(parseCategory("food")).toBeNull();
    expect(parseCategory(null)).toBeNull();
  });
});
