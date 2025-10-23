import express from "express";
import { createReadStream } from "fs";
import crypto from "crypto";
import http from "http";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pug from "pug";

// const express = require("express");
// const crypto = require("crypto");
// const http = require("http");
// const bodyParser = require("body-parser");
// const { createApp } = require("./app.js");
// const { createReadStream } = require("fs");

import appSrc from "./app.js";
import * as path from "node:path";
import {createProxyMiddleware} from "http-proxy-middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = appSrc(express, bodyParser, createReadStream, crypto, http, mongoose, createProxyMiddleware, pug, dotenv);

app.listen(3000);