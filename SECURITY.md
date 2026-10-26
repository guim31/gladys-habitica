# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **Habitica user id and API token**, stored by Gladys in the integration
  configuration (the token in a `secret` field), sent only to the configured
  Habitica address (habitica.com by default) in the `x-api-user` and
  `x-api-key` headers, and never logged. The token gives full access to the
  account: reset it in Habitica (Settings → Site Data → API) if it leaks;
- under `/data`, only `habitica-state.json`: the configured address, the user
  id, the time of the last reading, and the last level, health and number of
  dailies left (no token, no task);
- network: outgoing HTTP(S) requests to the configured Habitica address only.
  With "Accept self-signed certificates" ticked, the certificate of that
  address is not verified.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Habitica itself.
