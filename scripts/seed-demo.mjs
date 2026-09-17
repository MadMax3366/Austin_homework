const origin = "http://localhost:5173";

const signInResponse = await fetch(
  `${origin}/signin-with-chatgpt?return_to=/`,
  { redirect: "manual" },
);
const setCookie = signInResponse.headers.get("set-cookie");
if (!setCookie) {
  throw new Error(
    "Local sign-in was unavailable. Start the development server with npm run dev first.",
  );
}

const cookie = setCookie.split(";", 1)[0];
const workspaceResponse = await fetch(`${origin}/api/workspace`, {
  headers: { Cookie: cookie },
});
if (!workspaceResponse.ok) {
  throw new Error(
    `Demo seed failed with HTTP ${workspaceResponse.status}: ${await workspaceResponse.text()}`,
  );
}

const workspace = await workspaceResponse.json();
console.log(
  `Demo data is ready for ${workspace.today}: ${workspace.sessions.length} teacher sessions and ${workspace.roster.length} students in the selected roster.`,
);
