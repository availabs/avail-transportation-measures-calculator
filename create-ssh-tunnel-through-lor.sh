#!/bin/bash

# https://unix.stackexchange.com/a/115906

ssh -N -L 127.0.0.1:5432:ares:5432 lor
