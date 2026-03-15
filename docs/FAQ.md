# FAQ

## Is this a replacement for OpenClaw?

No. It is a product built on top of OpenClaw.

## Can I use it without changing OpenClaw source code?

Yes. That is the default installation model.

## Does it bring its own provider?

No. It inherits your existing OpenClaw provider/model configuration.

## Can I use only app-main?

You can, but then you are not using the forge as intended.

## Is it production-safe?

It is designed for production-style operation, but you still need to provide
your own domain rules, provider, and release governance.

## What does activate do?

It installs the product and then asks `app-forge` to initialize the runtime loop.

## What does uninstall remove?

It removes managed forge agents from OpenClaw config and cleans toolkit files.

## What does init do?

It seeds the installed domain pack from a packaged example template.

## What does upgrade do?

It refreshes the toolkit snapshot and re-merges the managed OpenClaw config.
