import type { Fetch } from "../src/chains.ts";

export interface Call {
  url: string;
  body: any;
}

/** A fetch that answers from `reply`. A string reply is sent as is; anything else as JSON. */
export function fakeFetch(reply: (url: string, body: any) => unknown, status = 200): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const answer = reply(url, body);
    return new Response(typeof answer === "string" ? answer : JSON.stringify(answer), { status });
  };
  return { fetch, calls };
}
