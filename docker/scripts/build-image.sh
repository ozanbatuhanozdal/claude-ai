#!/bin/bash

set -x

image_name=norobet/ai-tool
revision=$(git rev-parse --short HEAD)

if [ -n "$CI_COMMIT_BRANCH" ]
then
    branch=$CI_COMMIT_BRANCH
elif [ -n "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" ]
then
    branch=$CI_MERGE_REQUEST_TARGET_BRANCH_NAME
else
    branch=$(git rev-parse --abbrev-ref HEAD)
fi

echo "$image_name:$branch-$revision" > .revision

docker build . \
--no-cache \
-f docker/Dockerfile \
--tag norobet/ai-tool \
