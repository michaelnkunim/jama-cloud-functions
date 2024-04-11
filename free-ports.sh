#!/bin/bash

# Array of ports to check
ports=(7075 9099 5001 9098 9097 9096 9095 4000)

for port in "${ports[@]}"; do
    # Check if port is in use
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "Port $port is in use, attempting to free..."
        sudo lsof -ti:$port | xargs sudo kill -9
        echo "Port $port is now free."
    else
        echo "Port $port is free."
    fi
done
