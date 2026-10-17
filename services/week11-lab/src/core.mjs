export { limitedJSON, admit } from "./budget.mjs";
export const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
export const LIMITS = { output: 1024, perTurn: 12000 };
export function validate(b) {
  if (
    !b ||
    !["persona", "sampling"].includes(b.mode) ||
    typeof b.prompt !== "string" ||
    !b.prompt.trim() ||
    b.prompt.length > 1200
  )
    throw Error("invalid_input");
  if (Object.hasOwn(b, "topp") && Object.hasOwn(b, "topq")) throw Error("invalid_input");
  const nucleus = Object.hasOwn(b, "topq") ? b.topq : b.topp;
  if (
    !Number.isFinite(b.temperature) ||
    b.temperature < 0 ||
    b.temperature > 2 ||
    !Number.isInteger(b.topk) ||
    b.topk < 1 ||
    b.topk > 50 ||
    !Number.isFinite(nucleus) ||
    nucleus < 0.01 ||
    nucleus > 1
  )
    throw Error("invalid_input");
  if (
    b.mode === "persona" &&
    (typeof b.system !== "string" || !b.system.trim() || b.system.length > 1600)
  )
    throw Error("invalid_input");
  return {
    mode: b.mode,
    prompt: b.prompt.trim(),
    system: b.mode === "persona" ? b.system.trim() : "",
    temperature: b.temperature,
    topk: b.topk,
    topp: nucleus,
    nucleusName: Object.hasOwn(b, "topq") ? "top-q" : "top-p",
  };
}
export function messages(b) {
  return [
    {
      role: "system",
      content:
        "You are participating in an introductory linguistics classroom activity. Reply in English, in plain text. Follow the requested length; otherwise be concise. Do not claim to have taken actions outside the conversation. " +
        (b.mode === "persona"
          ? b.system
          : "Respond to the requested writing task directly. Do not explain your sampling settings."),
    },
    { role: "user", content: b.prompt },
  ];
}
