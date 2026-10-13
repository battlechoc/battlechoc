[![pipeline status](https://gitlab.com/battlechoc/battlechoc-pwa/badges/master/pipeline.svg)](https://gitlab.com/battlechoc/battlechoc-pwa/commits/master)

# battlechoc pwa

The battlechoc pwa allows the platform-independent playing of battlechoc. For desktop, web and mobile usage.

## Setup

### Private NPM Registry

To build and run battlechoc you need to set the following environment variable to allow battlechoc to fetch the npm scope @battlechoc which provides the battlechoc-shared-library package.

```zsh
export BATTLECHOC_NPM_TOKEN=<TOKEN>
# Get this token from our battlechoc-shared-library GitLab project Settings / CI/CD / Variables
```

## Rules

- battlechoc is a turn-based strategy game. A turn consists of two game phases: Build and attack
- You win the game as soon as your opponent's factory is destroyed and he has no cannons left, or does not have enough cocoa to build cannons

### Font

- ingame font-family: "Roboto", "Helvetica", "Arial", sans-serif;
- logo-font: [Lissain](https://www.dafontfree.net/freefonts-lissain-f20365.htm)

### Colors

- primary: #457B82
- secondary: #324D5C

Copyright &copy; 2019 by battlechoc.com – all rights reserved
