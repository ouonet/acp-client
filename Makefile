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
	mkdir -p ~/.vscode/extensions
	@rm -rf ~/.vscode/extensions/undefined_publisher.acp-client-* ~/.vscode/extensions/*.acp-client-* ~/.vscode/extensions/acp-client
	ln -sfn $(CURDIR) ~/.vscode/extensions/$(EXT_TARGET)
	ln -sfn $(CURDIR) ~/.vscode/extensions/acp-client
	@echo "Linked to ~/.vscode/extensions/$(EXT_TARGET)"
	@echo "⚠️  Important: In VS Code, run 'Developer: Reload Window' (Cmd+Shift+P) or restart VS Code to activate!"

unlink-vscode:
	@rm -rf ~/.vscode/extensions/undefined_publisher.acp-client-* ~/.vscode/extensions/*.acp-client-* ~/.vscode/extensions/acp-client
	@echo "Unlinked acp-client from ~/.vscode/extensions"
	@echo "⚠️  Important: In VS Code, run 'Developer: Reload Window' (Cmd+Shift+P) or restart VS Code."

link-cursor: build-prod
	mkdir -p ~/.cursor/extensions
	@rm -rf ~/.cursor/extensions/undefined_publisher.acp-client-* ~/.cursor/extensions/*.acp-client-* ~/.cursor/extensions/acp-client
	ln -sfn $(CURDIR) ~/.cursor/extensions/$(EXT_TARGET)
	ln -sfn $(CURDIR) ~/.cursor/extensions/acp-client
	@echo "Linked to ~/.cursor/extensions/$(EXT_TARGET)"
	@echo "⚠️  Important: In Cursor, run 'Developer: Reload Window' (Cmd+Shift+P) or restart Cursor to activate!"

unlink-cursor:
	@rm -rf ~/.cursor/extensions/undefined_publisher.acp-client-* ~/.cursor/extensions/*.acp-client-* ~/.cursor/extensions/acp-client
	@echo "Unlinked acp-client from ~/.cursor/extensions"
	@echo "⚠️  Important: In Cursor, run 'Developer: Reload Window' (Cmd+Shift+P) or restart Cursor."

link-antigravity-ide: build-prod
	mkdir -p ~/.antigravity-ide/extensions
	@rm -rf ~/.antigravity-ide/extensions/undefined_publisher.acp-client-* ~/.antigravity-ide/extensions/*.acp-client-* ~/.antigravity-ide/extensions/acp-client
	ln -sfn $(CURDIR) ~/.antigravity-ide/extensions/$(EXT_TARGET)
	ln -sfn $(CURDIR) ~/.antigravity-ide/extensions/acp-client
	@echo "Linked to ~/.antigravity-ide/extensions/$(EXT_TARGET)"
	@echo "⚠️  Important: In Antigravity IDE, run 'Developer: Reload Window' (Cmd+Shift+P) or restart Antigravity IDE to activate!"

unlink-antigravity-ide:
	@rm -rf ~/.antigravity-ide/extensions/undefined_publisher.acp-client-* ~/.antigravity-ide/extensions/*.acp-client-* ~/.antigravity-ide/extensions/acp-client
	@echo "Unlinked acp-client from ~/.antigravity-ide/extensions"
	@echo "⚠️  Important: In Antigravity IDE, run 'Developer: Reload Window' (Cmd+Shift+P) or restart Antigravity IDE."

clean:
	rm -rf dist out node_modules
