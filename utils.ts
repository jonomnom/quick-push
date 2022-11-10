import fetch from "cross-fetch";
export async function query(query: any, variables: any) {
  return fetch(
    `https://api.thegraph.com/subgraphs/name/jonomnom/gmx-referral-testing`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variables: variables,
        query: query,
      }),
    }
  ).then((result) => result.json());
}
