.PHONY: all build test lint format clean install

all: build

install:
	npm install

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

clean:
	rm -rf dist out node_modules
