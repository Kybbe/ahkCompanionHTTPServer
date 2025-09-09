import { combineRgb, InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import { ImageTransformer } from '@julusian/image-rs'
import got from 'got'
import { configFields } from './config.js'
import { upgradeScripts } from './upgrade.js'

class kybbeCompanionInstance extends InstanceBase {
	configUpdated(config) {
		this.config = config

		this.initActions()
		this.initFeedbacks()
	}

	init(config) {
		this.config = config
		this.feedbackTimers = {}
		this.feedbackIds = []

		this.updateStatus(InstanceStatus.Ok)

		this.initVariables()
		this.initActions()
		this.initFeedbacks()
		this.initPresets()

		this.getWindows()
		this.getWindowsPeriodically()


		this.log('info', 'init done')
	}

	// Return config fields for web config
	getConfigFields() {
		return configFields
	}

	// When module gets deleted
	async destroy() {
		if (this.feedbackTimers && Object.keys(this.feedbackTimers).length > 0) {
			for (const key of Object.keys(this.feedbackTimers)) {
				clearInterval(this.feedbackTimers[key])
			}
		}
	}

	customNameFeedbackConfigs = [
		{ customName: 'Gos', color: combineRgb(249, 237, 121) },
		{ customName: 'E2esuite', color: combineRgb(239, 19, 70) },
		{ customName: 'Vms-kiosk-fe', color: combineRgb(158, 230, 253) },
	]

	async getWindowObject(windowId) {
		const windows = this.getVariableValue(`windows`)
		if (windows === undefined || windows.length === 0 || Array.isArray(windows) === false) {
			this.log('warn', `(getWindowObject) No windows found in variables, or is not an array with elements`)
			return null
		}
		const windowAsNumber = Number(windowId)
		const windowAtId = windows?.[windowAsNumber]
		if (!windowAtId || Object.keys(windowAtId).length === 0) {
			this.log('warn', `(getWindowObject) Window ID ${windowId} not found in variables`)
			return null
		}
		return windowAtId
	}

	initActions() {
		this.setActionDefinitions({
			// Custom action for focusing window
			focusWindow: {
				name: 'Focus Window',
				options: [
					{
						id: 'windowId',
						label: 'Window ID',
						type: 'number',
						default: 0,
					},
				],
				callback: async (action, context) => {
					const windowId = action.options.windowId

					const windowAtId = await this.getWindowObject(windowId)
					if (!windowAtId) {
						this.log('warn', `(focusWindow) Window ID ${windowId} not found in variables`)
						this.updateStatus(InstanceStatus.UnknownError, 'Window ID not found')
						return
					}

					const actualIdOfWindowAtIndex = windowAtId.id
					const url = `${this.config.prefix || ''}/focusWindow?windowId=${actualIdOfWindowAtIndex}`

					try {
						await got.post(url)
						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `Focus Window failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},
		})
	}

	initFeedbacks() {
		// Generate feedbacks for each customName/color
		const customNameAppFeedbacks = this.customNameFeedbackConfigs.map(cfg => {
			const feedbackId = `customNameBackground_${cfg.customName}`
			return {
				[feedbackId]: {
					type: 'boolean',
					name: `Custom Name Background: ${cfg.customName}`,
					options: [
						{
							id: 'windowId',
							label: 'Window ID',
							type: 'number',
							default: 0,
						},
					],
					style: {
						bgcolor: cfg.color,
					},
					callback: async (feedback, context) => {
						const windowId = feedback.options.windowId
						const windowAtId = await this.getWindowObject(windowId)
						if (!windowAtId) {
							this.log('warn', `(customNameBackground) Window ID ${windowId} not found in variables`)
							return false
						}
						return windowAtId.customName && windowAtId.customName === cfg.customName
					}
				}
			}
		})

		const ids = customNameAppFeedbacks.map(feedback => Object.keys(feedback)[0])
		this.feedbackIds = ids

		let feedbacks = {
			// Custom feedback for window active
			windowActive: {
				type: 'boolean',
				name: 'Window Active',
				options: [
					{
						id: 'windowId',
						label: 'Window ID',
						type: 'number',
						default: 0,
					},
				],
				style: {
					bgcolor: combineRgb(0, 0, 64),
				},
				callback: async (feedback, context) => {
					// rerun when windows change
					const windowId = feedback.options.windowId

					const windowAtId = await this.getWindowObject(windowId)

					if (!windowAtId) {
						this.log('warn', `(windowActive) Window ID ${windowId} not found in variables`)
						return false
					}
					return windowAtId.active
				}
			},
			// Custom feedback for window icon
			windowIcon: {
				type: 'advanced',
				name: 'Window Icon',
				options: [
					{
						id: 'windowId',
						label: 'Window ID',
						type: 'number',
						default: 0,
					},
					{
						id: 'imageMode',
						label: 'Image mode',
						type: 'dropdown',
						choices: [
							{ id: 'fit', label: 'Fit' },
							{ id: 'fill', label: 'Fill' },
							{ id: 'crop', label: 'Crop' },
						],
						default: 'fit',
					},
					{
						id: 'imageSize',
						label: 'Image Size',
						type: 'dropdown',
						choices: [
							{ id: '36', label: '36x36' },
							{ id: '48', label: '48x48' },
							{ id: '72', label: '72x72' },
							{ id: '96', label: '96x96' },
							{ id: '128', label: '128x128' },
							{ id: '256', label: '256x256' },
						],
						default: '72',
					},
				],
				callback: async (feedback, context) => {
					// rerun when windows change
					const windowId = feedback.options.windowId

					const windowAtId = await this.getWindowObject(windowId)
					if (!windowAtId) {
						this.log('warn', `(windowIcon) Window ID ${windowId} not found in variables`)
						return {}
					}
					const actualIdOfWindowAtIndex = windowAtId.id
					if (!actualIdOfWindowAtIndex) {
						this.log('warn', `(windowIcon) Window ID ${windowId} has no actual id in variables`)
						return {}
					}
					const url = `${this.config.prefix || ''}/windowIcon?windowId=${actualIdOfWindowAtIndex}`
					try {
						const res = await got.get(url)

						const imageMode = feedback.options.imageMode;
						const imageModeCapitalized = imageMode?.charAt(0).toUpperCase() + imageMode?.slice(1).toLowerCase();

						const imageSize = parseInt(feedback.options.imageSize, 10);

						const png64 = await ImageTransformer.fromEncodedImage(res.rawBody)
							.scale(imageSize, imageSize, imageModeCapitalized || 'Fit')
							.toDataUrl('png')
						return { png64 }
					} catch (e) {
						this.log('error', `Failed to fetch window icon: ${e}`)
						return {}
					}
				}
			},
		}

		feedbacks = Object.assign(feedbacks, ...customNameAppFeedbacks)

		this.setFeedbackDefinitions(feedbacks);
	}

	initPresets() {
		const presets = {}

		const customNameFeedbackObjs = this.feedbackIds.map(feedbackId => {
			return {
				feedbackId: feedbackId,
				options: {
					windowId: 0,
				},
				style: {
					// Use color from config
					bgcolor: this.customNameFeedbackConfigs.find(cfg => `customNameBackground_${cfg.customName}` === feedbackId)?.color || combineRgb(0, 0, 0),
				}
			}
		})

		// window_image button
		presets['window_image'] = {
			type: 'button',
			category: 'kybbe',
			name: 'Window Image',
			style: {
				text: '',
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0), // dark blue
			},
			steps: [
				{
					down: [
						{
							actionId: 'focusWindow',
							options: {
								windowId: 0,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'windowIcon',
					options: {
						windowId: 0,
						imageSize: '72',
						imageMode: 'fit',
					},
					style: {}
				},
				...customNameFeedbackObjs,
				{
					feedbackId: 'windowActive',
					options: {
						windowId: 0,
					},
					style: {
						bgcolor: combineRgb(0, 0, 64),
					},
				},
			],
		}

		// window_text button
		presets['window_text'] = {
			type: 'button',
			category: 'kybbe',
			name: 'Window Text',
			style: {
				text: 'jsonpath($(kybbe:windows), "$[0].customName") ? jsonpath($(kybbe:windows), "$[0].customName") : ""',
				textExpression: true,
				size: '18',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0), // dark blue
				alignment: "center:top"
			},
			steps: [
				{
					down: [
						{
							actionId: 'focusWindow',
							options: {
								windowId: 0,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				...customNameFeedbackObjs,
				{
					feedbackId: 'windowActive',
					options: {
						windowId: 0,
					},
					style: {
						bgcolor: combineRgb(0, 0, 64),
					},
				},
			],
		}

		presets['combined_image_text'] = {
			type: 'button',
			category: 'kybbe',
			name: 'Combined Image and Text',
			style: {
				text: 'jsonpath($(kybbe:windows), "$[0].customName") ? jsonpath($(kybbe:windows), "$[0].customName") : ""',
				textExpression: true,
				size: '14',
				color: combineRgb(255, 255, 255),
				pngalignment: "center:top",
				alignment: "center:bottom",
				bgcolor: combineRgb(0, 0, 0), // dark blue
			},
			steps: [
				{
					down: [
						{
							actionId: 'focusWindow',
							options: {
								windowId: 0,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'windowIcon',
					options: {
						windowId: 0,
						imageSize: '48',
						imageMode: 'fit',
					},
					style: {}
				},
				...customNameFeedbackObjs,
				{
					feedbackId: 'windowActive',
					options: {
						windowId: 0,
					},
					style: {
						bgcolor: combineRgb(0, 0, 64),
					},
				},
			],
		}

		this.setPresetDefinitions(presets)
	}

	initVariables() {
		const variables = [
			{
				variableId: 'windows',
				name: 'windows',
			},
		]

		this.setVariableDefinitions(variables)
	}

	async getWindows() {
		if (!this.config.prefix) {
			this.updateStatus(InstanceStatus.BadConfig, 'No prefix set')
			return
		}

		const url = `${this.config.prefix}/windows`
		try {
			const res = await got.get(url).json()

			if (Array.isArray(res) && res.length > 0) {
				this.updateStatus(InstanceStatus.Ok)
			} else {
				this.updateStatus(InstanceStatus.UnknownError, 'No windows found')
				this.log('warn', `No windows found at ${url}`)
			}

			// Set the 'windows' variable to the JSON string of the array
			this.setVariableValues({
				windows: res
			})

			this.checkFeedbacks(/* ['windowActive', 'windowIcon'] */)
		} catch (e) {
			this.log('error', `Failed to fetch windows: ${e.message}`)
			this.updateStatus(InstanceStatus.UnknownError, e.code)
		}
	}

	async getWindowsPeriodically() {
		if (this.feedbackTimers['getWindows']) {
			clearInterval(this.feedbackTimers['getWindows'])
		}
		this.feedbackTimers['getWindows'] = setInterval(() => {
			this.getWindows()
		}, this.config.windowsRefreshInterval || 10000) // every 10 seconds
	}
}

runEntrypoint(kybbeCompanionInstance, upgradeScripts)
