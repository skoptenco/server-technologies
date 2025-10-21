import express from "express";
import { createReadStream } from "fs";
import crypto from "crypto";
import http from "http";
import bodyParser from "body-parser";
import { fileURLToPath } from 'url';

// const express = require("express");
// const crypto = require("crypto");
// const http = require("http");
// const bodyParser = require("body-parser");
// const { createApp } = require("./app.js");
// const { createReadStream } = require("fs");

import { createApp } from "./app.js";
import * as path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = createApp(express, bodyParser, createReadStream, `${__dirname}/app.js`, crypto, http);

app.listen(3000);