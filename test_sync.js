const BASE_URL = "http://localhost:8000";

// Call the function
const resp = await fetch(`${BASE_URL}/syncSheetsOptimized`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${Deno.env.get("BASE44_SERVICE_TOKEN")}`,
  },
  body: JSON.stringify({}),
});

const data = await resp.json();
console.log(JSON.stringify(data, null, 2));
