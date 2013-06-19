
(function () {

    ko.chuchoGrid = {
        // Defines a view model class you can use to populate a grid
        viewModel: function (configuration) {
            this.data = configuration.data;
            this.columns = configuration.columns;
        }
    };

    // Templates used to render the grid
    var templateEngine = new ko.jqueryTmplTemplateEngine();
    templateEngine.addTemplate("ko_chuchoGrid_grid", "\
                    <table class=\"chucho-grid\" cellspacing=\"0\">\
                        <thead>\
                            <tr>\
                                {{each(i, columnDefinition) columns}}\
                                    <th>${ columnDefinition.name }</th>\
                                {{/each}}\
                            </tr>\
                        </thead>\
                        <tbody>\
                            {{each(i, row) data}}\
                                <tr data-bind=\"clickHandler: row\"  class=\"${ i % 2 == 0 ? 'even' : 'odd' }\">\
                                    {{each(j, columnDefinition) columns}}\
                                        <td>${ typeof columnDefinition.field == 'function' ? columnDefinition.field(row) : row[columnDefinition.field] }</td>\
                                    {{/each}}\
                                </tr>\
                            {{/each}}\
                        </tbody>\
                    </table>");

    // The "chuchoGrid" binding
    ko.bindingHandlers.chuchoGrid = {
        // This method is called to initialize the node, and will also be called again if you change what the grid is bound to
        update: function (element, viewModelAccessor, allBindingsAccessor) {
            var viewModel = viewModelAccessor(), allBindings = allBindingsAccessor();
            
            // Empty the element
            while(element.firstChild)
                ko.removeNode(element.firstChild);

            // Allow the default templates to be overridden
            var gridTemplateName      = allBindings.chuchoGridTemplate || "ko_chuchoGrid_grid",
                pageLinksTemplateName = allBindings.chuchoGridPagerTemplate || "ko_chuchoGrid_pageLinks";

            // Render the main grid
            var gridContainer = element.appendChild(document.createElement("DIV"));
            ko.renderTemplate(gridTemplateName, viewModel, { templateEngine: templateEngine }, gridContainer, "replaceNode");
        }
    };
})();
