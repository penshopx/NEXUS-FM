---
name: Authorization object resolvers
description: Durable policy for enabling object-scoped authorization safely.
---

Object-scoped permissions remain fail-closed until the owning domain supplies
a trusted server-side relationship resolver.

An object ID, scope ID, client claim, URL parameter, or binding value is only
an identifier. It is not proof that the object exists, belongs to the active
organization, has the required ancestry, is assigned to the actor, belongs
to the vendor or team, is owned by the actor, or is in a permitted domain
state.

When a domain is added, its resolver must verify object existence,
organization isolation, applicable hierarchy, assignment/vendor/ownership
relationships, and state-dependent rules before passing verified context to
the central evaluator. Resolver failures and unresolved resource types must
remain denied.

Client-provided diagnostic context may help explain a development decision,
but it must never be used as trusted relationship proof. Sensitive decisions
must record only allowlisted authorization facts and must not persist
credentials, tokens, passwords, cookies, or arbitrary request payloads.