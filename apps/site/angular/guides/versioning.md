---
title: Versions and API stability
description: Supported Angular versions, the semantic versioning policy, and how the public API of @absoluteui/angular is protected.
---

## Angular versions

`@absoluteui/angular` supports Angular 22. Once Angular 23 ships, each release supports the current and the previous Angular major version.

## Policy

- Semantic versioning. Minor releases only add API.
- A removal follows at least one minor release in which the API is marked deprecated.

## How the API is protected

Every export of every entry point (classes, selectors, inputs, models, outputs, methods, functions, and types) is recorded, and the build fails on any difference: an addition, a removal, or a changed type has to be accepted deliberately. The Angular examples in this documentation are compiled with strict templates against the built package in the same build.

## Not supported

- Signal forms (Angular's experimental forms API): use reactive or template-driven forms.
- Custom elements: the components are Angular components and directives.
