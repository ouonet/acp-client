.PHONY: all build test lint format clean install

all: build

install:
	npm install

build:
	npm run build

build-prod:
	npm run build:prod

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

link-vscode: build-prod
	mkdir -p ~/.vscode/extensions
	ln -sfn $(CURDIR) ~/.vscode/extensions/acp-client
	@echo "Linked to ~/.vscode/extensions/acp-client. Restart VS Code to use!"

link-cursor: build-prod
	mkdir -p ~/.cursor/extensions
	ln -sfn $(CURDIR) ~/.cursor/extensions/acp-client
	@echo "Linked to ~/.cursor/extensions/acp-client. Restart Cursor to use!"

clean:
	rm -rf dist out node_modules
