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

# push branch tag
docker image push "$prefix/$image_name:$branch"

# push branch-revision
docker image push "$prefix/$image_name:$branch-$revision"

# push for each git tag
for tag in $tags
do
    docker image push "$prefix/$image_name:$tag"
done
