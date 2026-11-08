ARG BUILD_FROM
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

ARG BUILD_ARCH
ARG T3_VERSION=0.1.7
ARG CLOUDFLARED_VERSION=2026.10.7
ARG HA_MCP_VERSION=9.1.1

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg git jq nano vim-tiny less procps \
        util-linux bsdutils openssh-client bubblewrap \
        python3 python3-pip python3-venv \
        build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Node.js 24 LTS (required by t3: ^22.16 || ^23.11 || >=24.10)
# hadolint ignore=DL3008
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version

# T3 Code server (pinned) plus the agent CLIs it drives.
# Provider logins are done remotely through the T3 Code UI after pairing.
# hadolint ignore=DL3016
RUN npm install -g --no-fund --no-audit \
        "t3@${T3_VERSION}" \
        @anthropic-ai/claude-code@2.1.319 \
        @openai/codex@0.167.0 \
        opencode-ai@1.19.5 \
    && npm cache clean --force \
    && t3 --version

# cloudflared: the T3 Connect relay client. Preinstalled so the add-on
# never has to download it at runtime (T3CODE_CLOUDFLARED_PATH points here).
RUN case "${BUILD_ARCH}" in \
        amd64)   CF_ARCH="amd64" ;; \
        aarch64) CF_ARCH="arm64" ;; \
        *) echo "Unsupported BUILD_ARCH: ${BUILD_ARCH}" && exit 1 ;; \
    esac \
    && curl -fsSL -o /usr/local/bin/cloudflared \
        "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${CF_ARCH}" \
    && chmod +x /usr/local/bin/cloudflared \
    && cloudflared --version

# Home Assistant CLI so agents can run `ha ...` against the Supervisor.
RUN curl -fsSL -o /usr/local/bin/ha \
        "https://github.com/home-assistant/cli/releases/latest/download/ha_${BUILD_ARCH}" \
    && chmod +x /usr/local/bin/ha

# ha-mcp >=9 requires Python >=3.13; Debian Bookworm's python3 is too old.
# Install a standalone Python 3.13 via uv without replacing system Python.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && /root/.local/bin/uv python install 3.13 \
    && /root/.local/bin/uv venv --python 3.13 /opt/ha-mcp \
    && /root/.local/bin/uv pip install --python /opt/ha-mcp/bin/python "ha-mcp==${HA_MCP_VERSION}" \
    && ln -s /opt/ha-mcp/bin/ha-mcp /usr/local/bin/ha-mcp \
    && /opt/ha-mcp/bin/python --version

COPY rootfs/ /
RUN chmod +x /run.sh /opt/t3code/*.sh /usr/local/bin/ha-mcp-server

ENV HOME=/data/home \
    T3CODE_HOME=/data/t3code \
    T3CODE_CLOUDFLARED_PATH=/usr/local/bin/cloudflared \
    T3CODE_TELEMETRY_ENABLED=false \
    NODE_OPTIONS=--no-warnings

WORKDIR /config
CMD ["/run.sh"]
