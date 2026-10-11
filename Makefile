.PHONY: all build watch build-prod test lint format clean install link-vscode unlink-vscode link-cursor unlink-cursor link-antigravity-ide unlink-antigravity-ide

all: build

install:
	npm install

build:
	npm run build

watch: build
	npm run watch

build-prod:
	npm run build:prod

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

EXT_NAME := acp-client
EXT_PUB := ouonet
EXT_VER := $(shell node -p "require('./package.json').version")
EXT_TARGET := $(EXT_PUB).$(EXT_NAME)-$(EXT_VER)

link-vscode: build-prod
	node scripts/link-extension.mjs link vscode

unlink-vscode:
	node scripts/link-extension.mjs unlink vscode

link-cursor: build-prod
	node scripts/link-extension.mjs link cursor

unlink-cursor:
	node scripts/link-extension.mjs unlink cursor

link-antigravity-ide: build-prod
	node scripts/link-extension.mjs link antigravity-ide

unlink-antigravity-ide:
	node scripts/link-extension.mjs unlink antigravity-ide

clean:
	node -e "['dist', 'out', 'node_modules'].forEach(d => fs.rmSync(d, { recursive: true, force: true }))"

