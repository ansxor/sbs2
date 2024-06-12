#!/bin/bash
# yes but you don'[t know my PASSWORD!
set -ue
ssh 12@oboy.smilebasicsource.com -t 'eval `ssh-agent` && ssh-add ~/.ssh/new-oboy && cd ~/storage/sbs2/ && git pull --recurse-submodules && yes | ./admin/build-with-sourcemaps.sh ~/html/'
echo "done" >&2
