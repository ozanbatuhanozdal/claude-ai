#!/bin/bash

set -x

prefix="785865403848.dkr.ecr.eu-west-1.amazonaws.com"
image_name="norobet/ai-tool"

revision=$(git rev-parse --short HEAD)
tags=$(git tag --points-at HEAD)

if [ -n "$CI_COMMIT_BRANCH" ]
then
    branch=$CI_COMMIT_BRANCH
elif [ -n "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" ]
then
    branch=$CI_MERGE_REQUEST_TARGET_BRANCH_NAME
else
    branch=$(git rev-parse --abbrev-ref HEAD)
fi

# apply branch tag
docker image tag "$image_name" "$prefix/$image_name:$branch"

# tag branch
docker image tag "$image_name" "$prefix/$image_name:$branch-$revision"

# tag for each git tag
for tag in $tags
do
    docker image tag "$image_name" "$prefix/$image_name:$tag"
done
