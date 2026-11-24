# Security Policy

**Effective date:** 24 November 2026

AbsoluteUI is licensed under the [Apache License 2.0](LICENSE). Security fixes are delivered through official AbsoluteUI releases. This policy describes how to report vulnerabilities and which versions receive fixes.

---

## Supported Versions

| Version | Security fixes | Bug fixes |
|---|---|---|
| Latest `0.x` minor (currently `0.13`, before `1.0`), latest patch | Yes | Yes |
| Older `0.x` minors and patches | No. Upgrade to the latest `0.x` minor. | No |
| Latest major (`1.x`), latest minor | Yes | Yes |
| Latest major (`1.x`), older minors | No. Upgrade to the latest minor. | No |
| Last `0.x` minor after `1.0` is released | Yes, for 12 months after the `1.0` release | No |
| Older majors | No | No |

End-of-support dates for each major version are announced at least 6 months in advance on https://aui.kasadara.com.

The current release line is `0.13`. Until `1.0`, security fixes ship as patch releases of the latest `0.x` minor; always use the latest one.

## Reporting a Vulnerability

**Do not report security vulnerabilities through public issues, discussions, or social media.**

Report privately through either channel:

- **GitHub (preferred):** open a private vulnerability report at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI/security/advisories/new (the **Report a vulnerability** button on the repository's **Security** tab). Only you and the AbsoluteUI maintainers can see it, and we can work on the fix and the advisory with you there.
- **Email:** security@kasadara.com

The email contact is also published in `/.well-known/security.txt` on each AbsoluteUI website.

Include, where possible:

- affected package(s) and version(s);
- affected component(s);
- vulnerability type (for example XSS, CSP bypass, sanitizer bypass, or information exposure);
- steps to reproduce or a minimal proof of concept;
- browser(s) and version(s) used;
- impact assessment;
- any known workaround.

Do not include real personal data or production credentials in reports.

## Response Process

| Stage | Target |
|---|---|
| Acknowledgement of report | Within 3 business days |
| Initial triage and severity assessment (CVSS v3.1 or later) | Within 10 business days |
| Status updates to reporter | At least every 14 days until resolution |
| Fix release: Critical/High | Target 30 days from triage |
| Fix release: Medium/Low | Next scheduled release |

Targets are objectives, not guarantees. See Section 7 (Disclaimer of Warranty) of the [license](LICENSE).

## Coordinated Disclosure

- We ask reporters to keep vulnerability details confidential until a fixed release and advisory are published, or until 90 days after the report, whichever comes first, unless both parties agree otherwise.
- We will credit reporters in the advisory unless they request anonymity.
- We will request a CVE identifier for qualifying vulnerabilities through GitHub, which is a CVE Numbering Authority.

## Security Advisories

Advisories are published as GitHub security advisories at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI/security/advisories and at https://aui.kasadara.com/advisory/. They include:

- affected packages and versions;
- fixed versions;
- CVSS severity and vector;
- description and impact;
- workarounds, where available;
- CVE identifier, where assigned;
- reporter credit.

## Scope

**In scope:** the published packages `@absoluteui/core`, `@absoluteui/components`, `@absoluteui/theme`, `@absoluteui/icons`, `@absoluteui/utilities`, `@absoluteui/helpers`, and `@absoluteui/angular`, and the website https://aui.kasadara.com with its documentation (/docs/) and Theme Designer (/designer/) sections, also served at https://absoluteui.kasadara.com (the former addresses https://aui-docs.kasadara.com and https://aui-designer.kasadara.com only redirect to it).

**Out of scope:**

- vulnerabilities in consuming applications that do not originate in AbsoluteUI code;
- use of AbsoluteUI configurations explicitly documented as unsafe (for example consumer-allowlisted HTML elements or attributes; see the [security guide](https://aui.kasadara.com/docs/getting-started/security/));
- issues that only affect browsers outside the published supported-browser matrix;
- modified copies of AbsoluteUI, unless the issue is also present in an unmodified official release;
- findings from automated scanners without a demonstrated impact.

## Safe Harbor

We will not pursue legal action against researchers who, in good faith:

- follow this policy;
- avoid privacy violations, data destruction, and service disruption;
- test only against their own installations and data;
- give us reasonable time to remediate before disclosure.

Analysis performed solely to identify and report a vulnerability under this policy is authorized for that purpose.

## Contact

Kasadara Technology Solutions Pvt Ltd, 25, Avinashi Rd, TNHB Colony, Indira Nagar, Civil Aerodrome Post, Coimbatore, Tamil Nadu 641014, India. Security reports: security@kasadara.com. Other legal matters: legalops@kasadara.com.
