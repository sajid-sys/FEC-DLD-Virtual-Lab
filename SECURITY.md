# Security policy

FEC DLD Virtual Lab runs entirely in the browser and has no server, but students share **circuit codes** with each other, so a code that could run a script on someone else's device is a real problem.

## Reporting a problem

Please **do not** open a public issue for a security problem. Instead, report it privately on GitHub: go to the repository's **Security** tab and choose **Report a vulnerability**.

Include, if you can:

- what an attacker could do (for example "a shared circuit code runs JavaScript"),
- the steps or the circuit code that shows it,
- the browser you used.

You will get a reply as soon as possible, and credit in the fix if you would like it.

## What is in scope

- Circuit codes and saved data (localStorage) that inject HTML or script, or break the page.
- Anything that makes the lab load or run untrusted content.

The lab does not collect personal data and has no accounts, so there is nothing else to protect.
