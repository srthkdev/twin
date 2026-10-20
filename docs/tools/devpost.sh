#!/bin/sh
# Regenerate the Devpost copy of the write-up with absolute image URLs.
cd "$(dirname "$0")/../.." && sed 's#(/media/#(https://twin-jade-rho.vercel.app/media/#g' web/content/writeup.md > docs/DEVPOST.md
