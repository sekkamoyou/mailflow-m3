#!/bin/sh
# Write a native backend archive from the selected Git commit to stdout.
set -eu

commit=$(git rev-parse --verify --end-of-options "${1:?Usage: contrib/package-backend.sh REVISION}^{commit}")
build_env="BUILD_SHA=$commit
"
exec git archive --format=tar.gz --add-virtual-file="backend/build.env:$build_env" "$commit" -- backend
