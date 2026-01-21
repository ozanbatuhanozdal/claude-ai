#!/bin/bash

aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin 785865403848.dkr.ecr.eu-west-1.amazonaws.com